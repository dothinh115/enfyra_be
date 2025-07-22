import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable, ManyToOne, Index, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Method_definition } from './method_definition.entity';
import { Route_definition } from './route_definition.entity';

@Entity('hook_definition')
export class Hook_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "text", nullable: true })
    afterHook: string;
    @Column({ type: "text", nullable: true })
    description: string;
    @Column({ type: "boolean", nullable: false, default: false })
    isEnabled: boolean;
    @Column({ type: "boolean", nullable: false, default: false })
    isSystem: boolean;
    @Column({ type: "varchar", nullable: false })
    name: string;
    @Column({ type: "text", nullable: true })
    preHook: string;
    @Column({ type: "int", nullable: true, default: 0 })
    priority: number;
    @ManyToMany('Method_definition', (rel: any) => rel.hooks, { nullable: true, cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinTable()
    methods: any;
    @Index()
    @ManyToOne('Route_definition', (rel: any) => rel.hooks, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    route: any;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
