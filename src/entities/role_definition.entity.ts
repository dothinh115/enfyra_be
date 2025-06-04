import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity("role_definition")
export class Role_definition {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: "varchar", nullable: false })
  name: string;


  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}