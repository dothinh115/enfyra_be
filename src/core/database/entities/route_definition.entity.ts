import { Entity, Unique, PrimaryGeneratedColumn, Column, ManyToOne, Index, JoinColumn, ManyToMany, JoinTable, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Table_definition } from './table_definition.entity';
import { Route_permission_definition } from './route_permission_definition.entity';
import { Route_handler_definition } from './route_handler_definition.entity';
import { Hook_definition } from './hook_definition.entity';
import { Method_definition } from './method_definition.entity';

@Entity('route_definition')
@Unique(['mainTable', 'path'])
export class Route_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "text", nullable: true })
    description: string;
    @Column({ type: "varchar", nullable: false, default: "lucide:route" })
    icon: string;
    @Column({ type: "boolean", nullable: true, default: false })
    isEnabled: boolean;
    @Column({ type: "boolean", nullable: false, default: false })
    isSystem: boolean;
    @Column({ type: "varchar", nullable: false })
    path: string;
    @Index()
    @ManyToOne('Table_definition', { nullable: false, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    mainTable: any;
    @ManyToMany('Table_definition', { eager: true, nullable: true, cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinTable()
    targetTables: any;
    @OneToMany('Route_permission_definition', (rel: any) => rel.route, { cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    routePermissions: any;
    @OneToMany('Route_handler_definition', (rel: any) => rel.route, { cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    handlers: any;
    @OneToMany('Hook_definition', (rel: any) => rel.route, { cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    hooks: any;
    @ManyToMany('Method_definition', (rel: any) => rel.routes, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    publishedMethods: any;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
