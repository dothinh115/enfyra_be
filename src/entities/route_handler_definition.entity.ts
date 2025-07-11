import { Entity, Unique, PrimaryGeneratedColumn, Column, ManyToOne, Index, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Route_permission_map } from './route_permission_map.entity';
import { Route_definition } from './route_definition.entity';

@Entity('route_handler_definition')
@Unique(['permissionMap', 'route'])
export class Route_handler_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "text", nullable: true })
    description: string;
    @Column({ type: "text", nullable: true })
    logic: string;
    @Index()
    @ManyToOne('Route_permission_map', (rel: any) => rel.handlers, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    permissionMap: any;
    @Index()
    @ManyToOne('Route_definition', (rel: any) => rel.handlers, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    route: any;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
